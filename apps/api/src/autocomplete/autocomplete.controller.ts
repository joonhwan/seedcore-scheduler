import { Controller, Get, Query } from '@nestjs/common';
import { AutocompleteService } from './autocomplete.service';
import { AutocompleteTermDto } from '@sam/shared';

@Controller('autocomplete')
export class AutocompleteController {
  constructor(private readonly autocompleteService: AutocompleteService) {}

  @Get()
  async list(
    @Query('kind') kind?: 'GROUP' | 'ITEM',
    @Query('query') query?: string,
  ): Promise<AutocompleteTermDto[]> {
    return this.autocompleteService.list({ kind, query });
  }
}
