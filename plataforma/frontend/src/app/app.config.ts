import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withXsrfConfiguration } from '@angular/common/http';
import { provideRouter, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Las páginas cambian con una transición suave (donde el navegador la soporta).
    provideRouter(routes, withViewTransitions()),
    // CSRF: copia la cookie XSRF-TOKEN del servidor en la cabecera X-XSRF-TOKEN de cada POST/DELETE.
    provideHttpClient(withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' })),
  ],
};
