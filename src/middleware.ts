import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
    const maintenance = (import.meta.env.MAINTENANCE ?? process.env.MAINTENANCE) === 'true';
    const path = new URL(context.request.url).pathname;

    if (maintenance && path !== '/maintenance') {
        return context.redirect('/maintenance', 302);
    }

    return next();
});
