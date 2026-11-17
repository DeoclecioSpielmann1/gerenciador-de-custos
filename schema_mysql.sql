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