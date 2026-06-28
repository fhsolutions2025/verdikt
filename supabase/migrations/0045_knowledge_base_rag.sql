-- 0045 — Knowledge Base + RAG (VERDIKT Marketing Studio spec § Knowledge Base)
--
-- Uploaded documents are chunked, embedded (OpenAI text-embedding-3-small, 1536-d),
-- and retrieved by cosine similarity to ground agent output in real brand knowledge.
-- Embeddings are produced via the openai-proxy edge function (embeddings op).

create extension if not exists vector with schema extensions;

create table if not exists mkt_knowledge_documents (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid references mkt_brands(id) on delete cascade,
  org_id      uuid,
  title       text not null,
  source      text not null default 'upload',   -- upload | url | paste
  url         text,
  mime        text,
  bytes       integer,
  chunk_count integer not null default 0,
  status      text not null default 'ready',     -- ready | processing | failed
  error       text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists mkt_knowledge_documents_brand_idx on mkt_knowledge_documents (brand_id, created_at desc);

create table if not exists mkt_knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references mkt_knowledge_documents(id) on delete cascade,
  brand_id    uuid,
  chunk_index integer not null,
  content     text not null,
  embedding   extensions.vector(1536),
  created_at  timestamptz not null default now()
);
create index if not exists mkt_knowledge_chunks_doc_idx on mkt_knowledge_chunks (document_id, chunk_index);
-- IVFFlat cosine index for similarity search (lists tuned small for a modest corpus).
create index if not exists mkt_knowledge_chunks_embedding_idx
  on mkt_knowledge_chunks using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);

-- RLS: admin-only (mirrors the rest of the marketing tables). Writes go through the
-- service client; reads are admin via is_admin().
alter table mkt_knowledge_documents enable row level security;
alter table mkt_knowledge_chunks    enable row level security;
drop policy if exists "mkt_knowledge_documents: admin read" on mkt_knowledge_documents;
create policy "mkt_knowledge_documents: admin read" on mkt_knowledge_documents for select using (is_admin());
drop policy if exists "mkt_knowledge_chunks: admin read" on mkt_knowledge_chunks;
create policy "mkt_knowledge_chunks: admin read" on mkt_knowledge_chunks for select using (is_admin());

-- Similarity search RPC: top-k chunks for a query embedding, optionally scoped to a
-- brand. Returns content + cosine similarity (1 - distance).
create or replace function match_knowledge_chunks(
  query_embedding extensions.vector(1536),
  match_count int default 5,
  p_brand_id uuid default null
)
returns table (id uuid, document_id uuid, content text, similarity float)
language sql stable
as $$
  select c.id, c.document_id, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from mkt_knowledge_chunks c
  where c.embedding is not null
    and (p_brand_id is null or c.brand_id = p_brand_id)
  order by c.embedding <=> query_embedding
  limit match_count
$$;
