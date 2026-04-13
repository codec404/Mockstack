import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { Router } from "@angular/router";
import { catchError, switchMap, throwError } from "rxjs";
import { AuthService } from "./auth.service";

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.accessToken();
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes("/auth/")) {
        // Try refresh once
        return auth.refreshToken().pipe(
          switchMap((tokens) => {
            const retried = req.clone({
              setHeaders: { Authorization: `Bearer ${tokens.access_token}` },
            });
            return next(retried);
          }),
          catchError(() => {
            auth.logout();
            router.navigate(["/"]);
            return throwError(() => err);
          }),
        );
      }
      return throwError(() => err);
    }),
  );
};
