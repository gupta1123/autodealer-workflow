alter table public.packet_case_files
  drop constraint if exists packet_case_files_storage_path_key;

alter table public.bank_statement_imports
  drop constraint if exists bank_statement_imports_storage_path_key;

create index if not exists packet_case_files_storage_path_idx
  on public.packet_case_files(storage_path);

create index if not exists bank_statement_imports_storage_path_idx
  on public.bank_statement_imports(storage_path);
