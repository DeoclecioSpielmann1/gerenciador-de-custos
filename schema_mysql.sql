-- Execute no DBeaver (conexão localhost). Pode rodar mais de uma vez sem problema.
CREATE DATABASE IF NOT EXISTS gerenciador_custos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gerenciador_custos;

CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(80)  NOT NULL,
  email         VARCHAR(120) NOT NULL,
  telefone      VARCHAR(11)  NOT NULL,
  senha         VARCHAR(255) NULL,
  criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_email (email)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @senha_coluna = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'senha'
);
SET @adicionar_senha = IF(@senha_coluna = 0,
  'ALTER TABLE usuarios ADD COLUMN senha VARCHAR(255) NULL AFTER telefone',
  'SELECT 1');
PREPARE adicionar_senha FROM @adicionar_senha;
EXECUTE adicionar_senha;
DEALLOCATE PREPARE adicionar_senha;

SET @tipo_id_usuario = (
  SELECT COLUMN_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'id'
);
SET @criar_tokens_reset = CONCAT(
  'CREATE TABLE IF NOT EXISTS tokens_recuperacao_senha (',
  'usuario_id ', @tipo_id_usuario, ' NOT NULL,',
  'token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,',
  'expira_em DATETIME NOT NULL,',
  'criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,',
  'PRIMARY KEY (token_hash),',
  'INDEX idx_tokens_recuperacao_usuario (usuario_id),',
  'INDEX idx_tokens_recuperacao_expiracao (expira_em),',
  'FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE',
  ') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
);
PREPARE criar_tokens_reset FROM @criar_tokens_reset;
EXECUTE criar_tokens_reset;
DEALLOCATE PREPARE criar_tokens_reset;

-- Conferência
SELECT * FROM usuarios;

CREATE TABLE IF NOT EXISTS lancamentos (
  usuario_id INT UNSIGNED NOT NULL,
  id VARCHAR(24) NOT NULL,
  tipo ENUM('entrada','saida') NOT NULL,
  descricao VARCHAR(60) NOT NULL,
  categoria VARCHAR(30) NULL,
  data DATE NOT NULL,
  centavos BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (usuario_id, id),
  INDEX idx_lancamentos_data (usuario_id, data),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notas (
  usuario_id INT UNSIGNED NOT NULL,
  numero INT UNSIGNED NOT NULL,
  status ENUM('emitida','cancelada') NOT NULL DEFAULT 'emitida',
  total_centavos BIGINT UNSIGNED NOT NULL,
  dados JSON NOT NULL,
  criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, numero),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;