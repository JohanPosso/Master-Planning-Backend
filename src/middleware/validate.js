/**
 * Valida y normaliza params/query/body con esquemas zod. El resultado queda en `req.valid`
 * (en Express 5 `req.query` es de solo lectura). Un ZodError lo traduce el errorHandler a 400.
 */
export const validate = (esquemas) => (req, _res, next) => {
  req.valid = {};
  for (const parte of ['params', 'query', 'body']) {
    if (esquemas[parte]) req.valid[parte] = esquemas[parte].parse(req[parte] ?? {});
  }
  next();
};
