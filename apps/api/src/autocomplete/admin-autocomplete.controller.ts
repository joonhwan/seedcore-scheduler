import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AutocompleteService } from './autocomplete.service';
import {
  CreateAutocompleteTermDto,
  UpdateAutocompleteTermDto,
  AutocompleteTermDto,
} from '@sam/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OriginGuard } from '../common/origin.guard';
import { AdminOnly } from '../auth/auth.guard';
import {
  getClientIp,
  getUserAgent,
  type AuthenticatedRequest,
} from '../common/request-context';

@Controller('admin/autocomplete')
@UseGuards(OriginGuard)
@AdminOnly()
export class AdminAutocompleteController {
  constructor(private readonly autocompleteService: AutocompleteService) {}

  @Get()
  async list(
    @Query('kind') kind?: 'GROUP' | 'ITEM',
    @Query('query') query?: string,
    @Query('isSystem') isSystemStr?: string,
  ): Promise<AutocompleteTermDto[]> {
    let isSystem: boolean | undefined = undefined;
    if (isSystemStr === 'true') isSystem = true;
    if (isSystemStr === 'false') isSystem = false;

    return this.autocompleteService.adminList({ kind, query, isSystem });
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateAutocompleteTermDto))
  async create(
    @Body() body: CreateAutocompleteTermDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AutocompleteTermDto> {
    return this.autocompleteService.createAdminTerm(body, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      adminMode: !!req.adminMode,
    });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAutocompleteTermDto)) body: UpdateAutocompleteTermDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AutocompleteTermDto> {
    return this.autocompleteService.updateAdminTerm(id, body, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      adminMode: !!req.adminMode,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.autocompleteService.deleteAdminTerm(id, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      adminMode: !!req.adminMode,
    });
  }

  @Post('sync')
  @HttpCode(204)
  async manualSync(): Promise<void> {
    // 관리자가 수동으로 동기화 작업을 실행할 수 있는 API
    await this.autocompleteService.syncDynamicTerms();
  }
}
