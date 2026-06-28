// Knowledge Base + RAG (VERDIKT Marketing Studio spec § Knowledge Base).
//
// Uploaded documents are chunked, embedded (OpenAI text-embedding-3-small via the
// openai-proxy edge function), and stored in mkt_knowledge_chunks with a pgvector
// embedding. Agents retrieve the most relevant chunks for a brand to ground their
// output in real brand knowledge instead of inventing facts.

import { createServiceClient } from '@/lib/supabase/server'

type Svc = Awaited<ReturnType<typeof createServiceClient>>

export const EMBED_MODEL = 'text-embedding-3-small'
export const EMBED_DIM = 1536

// pgvector wants a literal '[a,b,c]'; PostgREST passes that string straight into the
// vector column / RPC param.
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`
}

function proxyConfig(): { baseUrl: string; key: string } {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) throw new Error('Knowledge embeddings not configured')
  return { baseUrl, key }
}

// Embed one or more strings via openai-proxy. Returns one vector per input.
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return []
  const { baseUrl, key } = proxyConfig()
  const res = await fetch(`${baseUrl}/functions/v1/openai-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(55_000),
  })
  if (!res.ok) throw new Error(`Embedding error ${res.status}`)
  const data = (await res.json()) as { data?: { embedding: number[] }[]; error?: unknown }
  if (!data.data?.length) throw new Error('Embedding returned no vectors')
  return data.data.map(d => d.embedding)
}

export async function embedText(text: string): Promise<number[]> {
  const [v] = await embedTexts([text])
  return v
}

// Split text into overlapping chunks on paragraph/sentence boundaries. Keeps chunks
// near `target` characters so each embeds well and retrieval stays granular.
export function chunkText(text: string, target = 1000, overlap = 120): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) return []
  const paras = clean.split(/\n\n+/)
  const chunks: string[] = []
  let buf = ''
  const flush = () => { if (buf.trim()) chunks.push(buf.trim()); buf = '' }
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > target && buf) {
      flush()
      // carry a small overlap from the previous chunk for context continuity
      const prev = chunks[chunks.length - 1] ?? ''
      buf = prev.slice(-overlap)
    }
    buf = buf ? `${buf}\n\n${p}` : p
    // a single oversized paragraph: hard-split it
    while (buf.length > target * 1.5) {
      chunks.push(buf.slice(0, target).trim())
      buf = buf.slice(target - overlap)
    }
  }
  flush()
  return chunks
}

export interface IngestResult { documentId: string; chunks: number }

// Ingest a text document for a brand: create the document row, chunk + embed the
// text, store the chunks, and mark the document ready. On failure the document is
// marked failed with the error so it surfaces in the UI.
export async function ingestDocument(
  svc: Svc,
  opts: { brandId: string; title: string; text: string; source?: string; url?: string; mime?: string; bytes?: number; createdBy?: string | null },
): Promise<IngestResult> {
  const { data: doc, error } = await svc.from('mkt_knowledge_documents').insert({
    brand_id: opts.brandId, title: opts.title.slice(0, 200), source: opts.source ?? 'upload',
    url: opts.url ?? null, mime: opts.mime ?? null, bytes: opts.bytes ?? null,
    status: 'processing', created_by: opts.createdBy ?? null,
  }).select('id').single()
  if (error || !doc) throw new Error(error?.message ?? 'document insert failed')
  const documentId = doc.id as string

  try {
    const chunks = chunkText(opts.text)
    if (!chunks.length) throw new Error('No extractable text')
    const vectors = await embedTexts(chunks)
    const rows = chunks.map((content, i) => ({
      document_id: documentId, brand_id: opts.brandId, chunk_index: i,
      content, embedding: toVectorLiteral(vectors[i]),
    }))
    const { error: cErr } = await svc.from('mkt_knowledge_chunks').insert(rows)
    if (cErr) throw new Error(cErr.message)
    await svc.from('mkt_knowledge_documents').update({ status: 'ready', chunk_count: chunks.length }).eq('id', documentId)
    return { documentId, chunks: chunks.length }
  } catch (err) {
    await svc.from('mkt_knowledge_documents').update({ status: 'failed', error: (err as Error).message.slice(0, 300) }).eq('id', documentId)
    throw err
  }
}

export interface KnowledgeHit { content: string; similarity: number; documentId: string }

// Retrieve the top-k most relevant chunks for a query, scoped to a brand. Returns []
// (never throws) so callers can treat knowledge as optional grounding.
export async function retrieveKnowledge(
  svc: Svc, opts: { brandId: string; query: string; k?: number; minSimilarity?: number },
): Promise<KnowledgeHit[]> {
  try {
    const vec = await embedText(opts.query)
    const { data, error } = await svc.rpc('match_knowledge_chunks', {
      query_embedding: toVectorLiteral(vec), match_count: opts.k ?? 5, p_brand_id: opts.brandId,
    })
    if (error || !Array.isArray(data)) return []
    const min = opts.minSimilarity ?? 0.2
    return (data as { content: string; similarity: number; document_id: string }[])
      .filter(r => r.similarity >= min)
      .map(r => ({ content: r.content, similarity: r.similarity, documentId: r.document_id }))
  } catch {
    return []
  }
}

// Format retrieved chunks into a compact context block for a system/user prompt.
export function formatKnowledgeContext(hits: KnowledgeHit[]): string {
  if (!hits.length) return ''
  const body = hits.map((h, i) => `[${i + 1}] ${h.content}`).join('\n\n')
  return `Relevant brand knowledge (use it; do not contradict or invent beyond it):\n${body}`
}
