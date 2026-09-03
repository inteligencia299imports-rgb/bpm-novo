/**
 * ID fixo do projeto BPM em `user_roles` (modelo multi-projeto).
 * Toda consulta a `user_roles` para resolver papel/nome de um usuário deve
 * filtrar por este projeto — a UNIQUE (user_id, projeto_id) garante 1 linha.
 * Sem o filtro, `.single()`/`.maybeSingle()` quebram (usuário tem N papéis,
 * um por projeto) e o nome deixa de aparecer.
 */
export const BPM_PROJETO_ID = "d007a2c2-7576-4a60-ba1b-c506a9c4fcac";
