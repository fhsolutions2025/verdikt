-- 0049 — Seed marketing agent tool access (VERDIKT Marketing Studio §6 Tool Access)
--
-- Each specialist agent receives only the tools required for its responsibilities, so
-- the §23 AI Agents screen shows a real per-agent toolset (not an empty list). Tool ids
-- mirror the ALL_TOOLS registry in components/company/AgentsTab.tsx.
update agent_configs set tools_enabled = '["llm_openai","llm_claude","brand_memory","publish_channels"]'::jsonb where agent_type='campaign_director_agent';
update agent_configs set tools_enabled = '["llm_openai","llm_claude","brand_memory","knowledge_base"]'::jsonb where agent_type='mkt_copywriter';
update agent_configs set tools_enabled = '["llm_openai"]'::jsonb where agent_type='mkt_router';
update agent_configs set tools_enabled = '["llm_openai","knowledge_base","seo_tools"]'::jsonb where agent_type='mkt_seo';
update agent_configs set tools_enabled = '["llm_openai","llm_claude","knowledge_base"]'::jsonb where agent_type='mkt_knowledge_researcher';
update agent_configs set tools_enabled = '["llm_claude","compliance_rules"]'::jsonb where agent_type='mkt_compliance';
update agent_configs set tools_enabled = '["llm_claude"]'::jsonb where agent_type='mkt_reviewer';
update agent_configs set tools_enabled = '["llm_claude"]'::jsonb where agent_type='qa_agent';
update agent_configs set tools_enabled = '["brand_memory","fal_media","ideogram"]'::jsonb where agent_type='mkt_creative_designer';
update agent_configs set tools_enabled = '["fal_media","ideogram"]'::jsonb where agent_type='mkt_prompt_optimizer';
update agent_configs set tools_enabled = '["fal_media"]'::jsonb where agent_type='mkt_video_producer';
update agent_configs set tools_enabled = '["brand_memory"]'::jsonb where agent_type='mkt_brand_guardian';
