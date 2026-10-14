import { Injectable, NotFoundException } from '@nestjs/common';
import { CalendarRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CalendarAccessService } from './calendar-access.service.js';
import { CalendarDto } from './calendar.dto.js';

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
  ) {}

  // async list(userId: string): Promise<CalendarDto[]> {
  // TODO: взять членства пользователя вместе с календарями (include), от старых к новым,
  //       ограничить через take (список из БД никогда не бывает безграничным, возьми константу, например 100),
  //       каждое членство преобразовать в CalendarDto.
  //       Подсказка: findMany возвращает массив, orderBy сортирует, take ограничивает количество.
  // }

  async get(userId: string, id: string): Promise<CalendarDto> {
    const membership = await this.access.requireRole(userId, id, CalendarRole.VIEWER);
    const calendar = await this.prisma.calendar.findUnique({ where: { id } });

    if (!calendar) throw new NotFoundException();

    return {
      id: calendar.id,
      name: calendar.name,
      color: calendar.color,
      role: membership.role,
    };
  }

  // async create(userId: string, dto: CreateCalendarDto): Promise<CalendarDto> {
  // TODO: создать календарь и членство OWNER для этого пользователя одним вложенным create,
  //       так же, как UserService.upsertFromGoogle. Преобразовать в CalendarDto.
  // ponytail: пока нет лимита числа календарей. Когда решим монетизацию, проверка лимита
  //           будет здесь, перед create, и нигде больше.
  // }

  // async update(userId: string, id: string, dto: UpdateCalendarDto): Promise<CalendarDto> {
  // TODO 1: менять настройки может только OWNER: requireRole первым, до любой записи.
  // TODO 2: обновить календарь из dto. Поле, которое undefined, Prisma не трогает,
  //         null его очищает, поэтому можно передать поля dto как есть.
  // TODO 3: вернуть CalendarDto с ролью из членства, полученного в TODO 1.
  // }

  // async remove(userId: string, id: string): Promise<void> {
  // TODO 1: удалять может только OWNER: requireRole первым.
  // TODO 2: удалить календарь. Участники и события уйдут вместе с ним: в схеме стоит onDelete: Cascade.
  //         Подсказка: delete удаляет одну строку по уникальному ключу (здесь по id). В отличие от deleteMany
  //         он бросает ошибку, если строки нет. Здесь это нормально: requireRole только что подтвердил, что она есть.
  //         Удаление последнего календаря разрешено: пользователь увидит пустой выбор только с кнопкой «+».
  // }
}
