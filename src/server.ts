import express from 'express';

import { json, urlencoded } from 'body-parser';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';

import { parseUserFromToken } from '~/middlewares/auth';
import revenucatRoutes from '~/routes/revenucat';
import v1Routes from '~/routes/v1';

import { env } from '~/utils/env';
import { logRequest } from '~/utils/logger';

import { discordService } from './services/discord.service';

const app = express();
app.set('trust proxy', 1); // trust first proxy i.e. nginx
app.use(logRequest());

app.use(helmet());
app.use(
  cors({
    methods: ['GET', 'PUT', 'PATCH', 'POST', 'DELETE'],
    origin: (origin, callback) => {
      return callback(null, true);
      // if (env.NODE_ENV !== 'production') {
      //   return callback(null, true);
      // }
      // if (origin) return callback(null, env.ALLOWED_ORIGINS);
      // return callback(new Error('Not allowed by cors'));
    },
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

app.use(json({ limit: '500mb' }));
app.use(urlencoded({ extended: true }));
app.use(compression());
app.use(cookieParser());

app.use(parseUserFromToken);

app.get('/health', async (_, res) => {
  try {
    await discordService.sendAppHealthNotification();
  } catch (error) {
    // Log error but don't fail the health check
    console.error('Failed to send health notification to Discord:', error);
  }
  return void res.send(`<h1>${env.APP_NAME} is running !!!</h1>`);
});

app.use(
  '/public',
  (_, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return next();
  },
  express.static(__dirname + '/storage/public'),
);

// `/storage/app` directory will be copied during build process.
// so static files and assets should be kept in this directory. So that they are synced between both dev and prod environments.
// we can expose publicly accessible static files by keeping inside `/storage/app/public` folder using this route.
app.use(
  '/static',
  (_, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return next();
  },
  express.static(__dirname + '/storage/app/public'),
);

app.use('/v1/api', v1Routes);
app.use('/api/revenucat', revenucatRoutes);

export default app;
