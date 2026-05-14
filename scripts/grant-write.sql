-- 授予 service_role 对所有表的写入权限（service_role 绕过 RLS，仅服务端使用）
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO service_role;
