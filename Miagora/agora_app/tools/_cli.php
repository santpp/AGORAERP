<?php
/** Utilidades de las herramientas de línea de comandos (solo se ejecutan por SSH, nunca por la web). */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../bootstrap.php';

/** @return array<string,string|bool> --clave=valor y --bandera */
function cli_args(array $argv): array
{
    $out = ['_' => []];
    foreach (array_slice($argv, 1) as $a) {
        if (preg_match('/^--([a-z0-9-]+)(?:=(.*))?$/', $a, $m)) {
            $out[$m[1]] = $m[2] ?? true;
        } else {
            $out['_'][] = $a;
        }
    }
    return $out;
}

function cli_out(string $s = ''): void
{
    fwrite(STDOUT, $s . "\n");
}

function cli_err(string $s): void
{
    fwrite(STDERR, "\033[31m✗\033[0m " . $s . "\n");
}

function cli_ok(string $s): void
{
    fwrite(STDOUT, "\033[32m✓\033[0m " . $s . "\n");
}

function cli_ask(string $q, ?string $default = null): string
{
    fwrite(STDOUT, $q . ($default !== null ? " [{$default}]" : '') . ': ');
    $v = trim((string) fgets(STDIN));
    return $v === '' && $default !== null ? $default : $v;
}

/** Pide una clave sin mostrarla en pantalla */
function cli_secret(string $q): string
{
    fwrite(STDOUT, $q . ': ');
    $tty = function_exists('posix_isatty') && posix_isatty(STDIN);
    if ($tty) {
        shell_exec('stty -echo');
    }
    $v = rtrim((string) fgets(STDIN), "\r\n");
    if ($tty) {
        shell_exec('stty echo');
        fwrite(STDOUT, "\n");
    }
    return $v;
}

function cli_run(callable $fn): void
{
    try {
        $fn();
    } catch (\Agora\Http\HttpError $e) {
        cli_err($e->getMessage());
        exit(1);
    } catch (\Throwable $e) {
        cli_err($e->getMessage());
        exit(1);
    }
}
