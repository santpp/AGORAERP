import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  // Las páginas cambian con una transición suave (donde el navegador la soporta).
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes, withViewTransitions())],
};
