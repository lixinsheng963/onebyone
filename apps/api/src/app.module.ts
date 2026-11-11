import { Module } from '@nestjs/common';
import { AdminController } from './controllers/admin.controller';
import { AuthController } from './controllers/auth.controller';
import { FeedController } from './controllers/feed.controller';
import { HealthController } from './controllers/health.controller';
import { MediaController } from './controllers/media.controller';
import { MeController } from './controllers/me.controller';
import { NoticesController } from './controllers/notices.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { PostsController } from './controllers/posts.controller';
import { ReportsController } from './controllers/reports.controller';
import { DeepSeekService } from './core/deepseek.service';
import { StoreService } from './core/store.service';
import { LoginThrottleService } from './core/login-throttle.service';
import { RedisService } from './core/redis.service';
import { StorageService } from './core/storage.service';
import { WechatAuthService } from './core/wechat-auth.service';
import { WechatSafetyService } from './core/wechat-safety.service';

@Module({
  controllers: [
    HealthController,
    AuthController,
    FeedController,
    PostsController,
    MediaController,
    MeController,
    NoticesController,
    NotificationsController,
    ReportsController,
    AdminController
  ],
  providers: [
    {
      provide: StoreService,
      useFactory: async () => {
        const store = new StoreService();
        await store.init();
        return store;
      }
    },
    DeepSeekService,
    WechatSafetyService,
    WechatAuthService,
    StorageService,
    RedisService,
    LoginThrottleService
  ]
})
export class AppModule {}
