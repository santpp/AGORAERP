<?php
declare(strict_types=1);

namespace Agora\Api;

use Agora\App;
use Agora\Http\HttpError;
use Agora\Http\Router;
use Agora\Security\Validator;

/** Tasas en vivo (BCV y Binance P2P), cotización congelada por operación, historial y política de la empresa. */
final class RatesApi
{
    public static function routes(Router $r, App $app): void
    {
        $r->add('GET', '/api/v1/tasas', fn (Ctx $c) => self::current($c), ['perm' => 'datos.leer']);
        $r->add('POST', '/api/v1/tasas/cotizar', fn (Ctx $c) => self::quote($c), ['perm' => 'tasas.cotizar', 'rate' => ['tasas:cotizar:{user}', 120, 3600]]);
        $r->add('GET', '/api/v1/tasas/historial', fn (Ctx $c) => ['dias' => $c->app->fx()->history((int) ($c->req->query['dias'] ?? 30))], ['perm' => 'datos.leer']);
        $r->add('POST', '/api/v1/tasas/politica', fn (Ctx $c) => self::policy($c), ['perm' => 'fiscal.configurar']);
        $r->add('POST', '/api/v1/plataforma/tasas/actualizar', fn (Ctx $c) => $c->app->fx()->refresh(), ['org' => false, 'platform' => true, 'rate' => ['tasas:actualizar', 12, 3600]]);
    }

    private static function current(Ctx $c): array
    {
        $fx = $c->app->fx();
        $cur = $fx->current();
        $policy = $fx->policy($c->orgId());
        $cur['politica_empresa'] = $policy;
        $cur['por_operacion'] = [];
        foreach (['COBRO_BS', 'VENTA_USDT', 'COMPRA_USDT', 'FISCAL'] as $op) {
            $ch = $fx->choose($op, $policy, $cur);
            $cur['por_operacion'][$op] = ['tasa' => $ch['tasa'], 'fuente' => $ch['fuente'], 'regla' => $ch['regla']];
        }
        return $cur;
    }

    private static function quote(Ctx $c): array
    {
        $d = $c->json();
        $op = strtoupper((string) ($d['operacion'] ?? 'COBRO_BS'));
        $amount = isset($d['monto_usd']) && $d['monto_usd'] !== '' && $d['monto_usd'] !== null ? Validator::cents($d['monto_usd']) : null;
        if ($amount !== null && $amount <= 0) {
            throw HttpError::badRequest('El monto debe ser mayor que cero.');
        }
        return $c->app->fx()->quote($c->orgId(), $c->userId(), $op, $amount);
    }

    private static function policy(Ctx $c): array
    {
        $p = Validator::enum($c->json()['politica'] ?? '', ['SEGUN_OPERACION', 'SIEMPRE_ALTA'], 'Política');
        $c->app->fx()->setPolicy($c->orgId(), $p, $c->userId());
        $c->audit('tasas', 'cambió la política de tasas a ' . ($p === 'SIEMPRE_ALTA' ? '"siempre la más alta"' : '"según la operación"'));
        return ['politica' => $p];
    }
}
