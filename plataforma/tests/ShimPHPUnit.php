<?php

/** Base mínima compatible con PHPUnit, solo para ejecutar tests/run.php sin Composer. */

declare(strict_types=1);

namespace PHPUnit\Framework {
    abstract class TestCase
    {
        private ?string $esperada = null;

        protected function setUp(): void
        {
        }

        public function prepararPrueba(): void
        {
            $this->setUp();
        }

        protected function tearDown(): void
        {
        }

        public function terminarPrueba(): void
        {
            $this->tearDown();
        }

        protected function expectException(string $clase): void
        {
            $this->esperada = $clase;
        }

        public function excepcionEsperada(): ?string
        {
            return $this->esperada;
        }

        protected function assertSame(mixed $esperado, mixed $real, string $mensaje = ''): void
        {
            if ($esperado !== $real) {
                throw new AssertionFailed(($mensaje ?: 'Valores distintos') . ': esperado ' . var_export($esperado, true) . ', obtenido ' . var_export($real, true));
            }
        }

        protected function assertCount(int $n, array|\Countable $lista): void
        {
            $real = count($lista);
            if ($real !== $n) {
                throw new AssertionFailed("Se esperaban {$n} elementos, hay {$real}");
            }
        }

        protected function assertTrue(bool $valor, string $mensaje = ''): void
        {
            if ($valor !== true) {
                throw new AssertionFailed($mensaje ?: 'Se esperaba true');
            }
        }
    }

    final class AssertionFailed extends \RuntimeException
    {
    }
}
