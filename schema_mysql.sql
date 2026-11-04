-- Execute no DBeaver (conexão localhost). Pode rodar mais de uma vez sem problema.
CREATE DATABASE IF NOT EXISTS gerenciador_custos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gerenciador_custos;

CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(80)  NOT NULL,
  email         VARCHAR(120) NOT NULL,
  telefone      VARCHAR(11)  NOT NULL,
  criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_email (email)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Conferência
SELECT * FROM usuarios;