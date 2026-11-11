import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  health() {
    return { status: 'ok', service: 'campus-api', time: new Date().toISOString() };
  }
}
