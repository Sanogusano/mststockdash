GRANT ALL ON TABLE public.addi_transactions TO service_role;
GRANT ALL ON TABLE public.addi_upload_history TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;