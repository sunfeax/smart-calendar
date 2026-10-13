import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { SESSION_COOKIE } from './session/session.constants.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

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

  await app.listen(process.env['PORT'] ?? 3000);
}
await bootstrap();
