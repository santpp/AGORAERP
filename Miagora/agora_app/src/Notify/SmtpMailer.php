<?php
declare(strict_types=1);

namespace Agora\Notify;

/**
 * Envío de correo por SMTP sin librerías externas (SSL en el puerto 465 o STARTTLS en el 587).
 * Hostinger: smtp.hostinger.com · 465 · SSL, con una cuenta de correo del dominio (p. ej. seguridad@agoradigital.app).
 */
final class SmtpMailer
{
    /** @var resource|null */
    private $fp = null;

    public function __construct(
        private string $host,
        private int $port,
        private string $secure,
        private string $user,
        private string $pass,
        private string $fromEmail,
        private string $fromName,
        private int $timeout = 15,
    ) {
    }

    public function send(string $to, string $subject, string $text, ?string $html = null): void
    {
        foreach ([$to, $subject, $this->fromEmail, $this->fromName] as $h) {
            if (preg_match('/[\r\n]/', $h)) {
                throw new \RuntimeException('Cabecera de correo inválida');
            }
        }
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            throw new \RuntimeException('Destinatario inválido');
        }
        $this->connect();
        try {
            $this->cmd('MAIL FROM:<' . $this->fromEmail . '>', [250]);
            $this->cmd('RCPT TO:<' . $to . '>', [250, 251]);
            $this->cmd('DATA', [354]);
            $msg = $this->build($to, $subject, $text, $html);
            // "dot-stuffing": una línea que empieza con punto se duplica
            $msg = preg_replace('/^\./m', '..', $msg) ?? $msg;
            fwrite($this->fp, $msg . "\r\n.\r\n");
            $this->expect([250]);
            $this->cmd('QUIT', [221]);
        } finally {
            if (is_resource($this->fp)) {
                fclose($this->fp);
            }
            $this->fp = null;
        }
    }

    private function connect(): void
    {
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $this->host, 'SNI_enabled' => true]]);
        $remote = ($this->secure === 'ssl' ? 'ssl://' : 'tcp://') . $this->host . ':' . $this->port;
        $fp = @stream_socket_client($remote, $errno, $errstr, $this->timeout, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) {
            throw new \RuntimeException("No se pudo conectar al servidor de correo ({$errstr})");
        }
        stream_set_timeout($fp, $this->timeout);
        $this->fp = $fp;
        $this->expect([220]);
        $ehlo = 'EHLO ' . (gethostname() ?: 'agoradigital.app');
        $this->cmd($ehlo, [250]);
        if ($this->secure === 'tls') {
            $this->cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($this->fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT') ? STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT : 0))) {
                throw new \RuntimeException('No se pudo activar TLS con el servidor de correo');
            }
            $this->cmd($ehlo, [250]);
        }
        if ($this->user !== '') {
            $this->cmd('AUTH LOGIN', [334]);
            $this->cmd(base64_encode($this->user), [334]);
            $this->cmd(base64_encode($this->pass), [235], true);
        }
    }

    private function cmd(string $line, array $ok, bool $secret = false): string
    {
        fwrite($this->fp, $line . "\r\n");
        return $this->expect($ok, $secret ? '[credenciales]' : $line);
    }

    private function expect(array $ok, string $after = ''): string
    {
        $resp = '';
        while (($l = fgets($this->fp, 1024)) !== false) {
            $resp .= $l;
            if (strlen($l) < 4 || $l[3] === ' ') {
                break;
            }
        }
        $code = (int) substr($resp, 0, 3);
        if (!in_array($code, $ok, true)) {
            throw new \RuntimeException('SMTP ' . ($after !== '' ? "({$after}) " : '') . 'respondió: ' . trim($resp));
        }
        return $resp;
    }

    private function build(string $to, string $subject, string $text, ?string $html): string
    {
        $domain = substr(strrchr($this->fromEmail, '@') ?: '@agoradigital.app', 1);
        $b = 'b' . bin2hex(random_bytes(12));
        $enc = fn (string $s) => '=?UTF-8?B?' . base64_encode($s) . '?=';
        $h = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . $enc($this->fromName) . ' <' . $this->fromEmail . '>',
            'To: <' . $to . '>',
            'Subject: ' . $enc($subject),
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . $domain . '>',
            'MIME-Version: 1.0',
            'Auto-Submitted: auto-generated',
            'X-Mailer: AgoraDigitalApp/11',
        ];
        if ($html === null) {
            $h[] = 'Content-Type: text/plain; charset=UTF-8';
            $h[] = 'Content-Transfer-Encoding: base64';
            return implode("\r\n", $h) . "\r\n\r\n" . rtrim(chunk_split(base64_encode($text), 76, "\r\n"));
        }
        $h[] = 'Content-Type: multipart/alternative; boundary="' . $b . '"';
        $body = "--{$b}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text), 76, "\r\n")
            . "--{$b}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html), 76, "\r\n")
            . "--{$b}--";
        return implode("\r\n", $h) . "\r\n\r\n" . $body;
    }
}
