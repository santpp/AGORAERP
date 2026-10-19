import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api';
import { SesionService } from '../../core/sesion';
import { MESES, mesInicio } from '../../core/meses';

@Component({
  selector: 'app-nuevo-contrato',
  imports: [FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './nuevo.html',
  styleUrl: './nuevo.scss',
})
export class NuevoContrato {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly sesion = inject(SesionService);

  protected readonly meses = MESES;
  protected readonly anios = [new Date().getFullYear(), new Date().getFullYear() + 1];

  protected cliente = { nombre: '', cedula: '', telefono: '', correo: '' };
  protected curso = { cuota: '', meses: 12, anio: this.anios[0], mes: 1, cuotasPorMes: 1 };

  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  protected crear(): void {
    if (this.guardando()) {
      return;
    }
    this.guardando.set(true);
    this.error.set('');
    this.api
      .crear({
        cliente: {
          nombre: this.cliente.nombre.trim(),
          cedula: this.cliente.cedula.trim(),
          telefono: this.cliente.telefono.trim(),
          correo: this.cliente.correo.trim(),
        },
        curso: {
          cuota_mensual: this.curso.cuota.trim(),
          meses: Number(this.curso.meses),
          mes_inicio: mesInicio(Number(this.curso.anio), Number(this.curso.mes)),
          cuotas_por_mes: Number(this.curso.cuotasPorMes),
          cargos: [],
        },
        // Quien crea el convenio es la persona responsable: recibe el aviso cuando se firma.
        responsable: { nombre: this.sesion.usuario()?.nombre ?? '', correo: this.sesion.usuario()?.correo ?? '' },
      })
      .subscribe({
        next: ({ uid }) => this.router.navigateByUrl(`/contratos/${uid}`),
        error: (e: Error) => {
          this.error.set(e.message);
          this.guardando.set(false);
        },
      });
  }
}
