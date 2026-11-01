import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { SESSION_COOKIE } from './features/session/session.constants.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProduction = process.env['NODE_ENV'] === 'production';

  app.enableShutdownHooks();
  app.set('trust proxy', 'loopback, uniquelocal');
  app.setGlobalPrefix('api');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  if (!isProduction) setupSwagger(app);

  await app.listen(process.env['PORT'] ?? 3000);
}

function setupSwagger(app: NestExpressApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Smart Calendar API')
    .setVersion('1.0')
    .addCookieAuth(SESSION_COOKIE)
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controller, method) =>
      controller.replace(/Controller$/, '').replace(/^./, c => c.toLowerCase()) +
      method.charAt(0).toUpperCase() +
      method.slice(1),
  });
  SwaggerModule.setup('api/docs', app, document);
}
await bootstrap();
