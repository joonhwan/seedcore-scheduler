import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AutocompleteService } from './autocomplete.service';
import { AutocompleteController } from './autocomplete.controller';
import { AdminAutocompleteController } from './admin-autocomplete.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AutocompleteController, AdminAutocompleteController],
  providers: [AutocompleteService],
  exports: [AutocompleteService],
})
export class AutocompleteModule {}
