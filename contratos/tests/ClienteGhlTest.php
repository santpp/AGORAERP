<?php

declare(strict_types=1);

namespace Asocim\Contratos\Tests;

use Asocim\Contratos\Ghl\ClienteGhl;
use PHPUnit\Framework\TestCase;

final class ClienteGhlTest extends TestCase
{
    public function test_contacto_se_crea_con_nombre_separado_y_devuelve_id(): void
    {
        $enviado = [];
        $cliente = new ClienteGhl('t', 'loc', function (string $m, string $url, array $cuerpo) use (&$enviado): array {
            $enviado[] = [$m, $url, $cuerpo];
            return ['contact' => ['id' => 'abc123']];
        });

        $id = $cliente->contactoPara('yuly@example.com', 'Yuly Eunice Navas Callaspo', '0412-5063751');

        $this->assertSame('abc123', $id);
        $this->assertSame('POST', $enviado[0][0]);
        $this->assertTrue(str_ends_with($enviado[0][1], '/contacts/upsert'));
        $this->assertSame('loc', $enviado[0][2]['locationId']);
        $this->assertSame('Yuly', $enviado[0][2]['firstName']);
        $this->assertSame('Eunice Navas Callaspo', $enviado[0][2]['lastName']);
    }

    public function test_respuesta_sin_id_de_contacto_falla(): void
    {
        $cliente = new ClienteGhl('t', 'loc', fn () => []);
        $this->expectException(\Asocim\Contratos\Servicio\ErrorContrato::class);
        $cliente->contactoPara('x@example.com', 'X', null);
    }

    public function test_correo_va_como_email_al_contacto(): void
    {
        $enviado = [];
        $cliente = new ClienteGhl('t', 'loc', function (string $m, string $url, array $cuerpo) use (&$enviado): array {
            $enviado[] = [$url, $cuerpo];
            return [];
        });

        $cliente->enviarCorreo('abc123', 'Asunto', '<p>Hola</p>');

        $this->assertTrue(str_ends_with($enviado[0][0], '/conversations/messages'));
        $this->assertSame('Email', $enviado[0][1]['type']);
        $this->assertSame('abc123', $enviado[0][1]['contactId']);
        $this->assertSame('Asunto', $enviado[0][1]['subject']);
    }

    public function test_busqueda_devuelve_contactos_con_nombre_correo_y_telefono(): void
    {
        $cliente = new ClienteGhl('t', 'loc', function (string $m, string $url, array $cuerpo): array {
            if (str_contains($url, '/customFields')) {
                return ['customFields' => [['id' => 'f-ced', 'fieldKey' => 'contact.cedula', 'name' => 'Cédula']]];
            }
            $this->assertSame('GET', $m);
            $this->assertTrue(str_contains($url, 'query=Yuly'));
            return ['contacts' => [
                ['id' => 'c1', 'firstName' => 'Yuly', 'lastName' => 'Navas', 'email' => 'y@example.com', 'phone' => '0412',
                    'customFields' => [['id' => 'f-ced', 'value' => '14943155']]],
                ['id' => '', 'firstName' => 'Sin id'],
            ]];
        });

        $resultado = $cliente->buscarContactos('Yuly');

        $this->assertCount(1, $resultado);
        $this->assertSame(['id' => 'c1', 'nombre' => 'Yuly Navas', 'correo' => 'y@example.com', 'telefono' => '0412', 'cedula' => '14943155', 'asignado' => ''], $resultado[0]);
    }
}
