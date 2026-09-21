// Database-driven Scheduler Engine
import { db } from '../db/database';
import { executePriceTable } from './tableExecution';

export class SchedulerWorker {
  private timer: NodeJS.Timeout | null = null;
  private isTickRunning = false;

  public start(intervalMs: number = 30000) {
    if (this.timer) return;
    console.log('⏱️ Database-driven Scheduler worker started (interval: 30s)');
    this.timer = setInterval(() => {
      this.tick().catch((err) => console.error('Scheduler tick error:', err));
    }, intervalMs);

    // Initial check shortly after startup
    setTimeout(() => {
      this.tick().catch((err) => console.error('Initial scheduler tick error:', err));
    }, 5000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async tick() {
    if (this.isTickRunning) return;
    this.isTickRunning = true;

    try {
      const schema = db.getSchema();
      const settings = schema.global_settings;
      const now = new Date();

      // Check Friday rule
      const dayOfWeek = now.getDay(); // 0 is Sunday, 5 is Friday
      if (dayOfWeek === 5 && !settings.friday_enabled) {
        return; // Friday disabled
      }

      // Format current time HH:mm
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMinutes}`;
      const todayDateStr = now.toISOString().split('T')[0];

      // Working hours check
      if (currentTimeStr < settings.working_hours_start || currentTimeStr > settings.working_hours_end) {
        return; // Outside working hours
      }

      // Check each active Price Table
      for (const table of schema.price_tables) {
        if (!table.active) continue;

        // Check daily table run record
        let dailyTable = schema.daily_table_runs.find(
          (d) => d.price_table_id === table.id && d.run_date === todayDateStr
        );

        if (!dailyTable) {
          dailyTable = {
            id: db.getNextId('daily_table_runs'),
            price_table_id: table.id,
            run_date: todayDateStr,
            status: 'PENDING',
            attempt_count: 0
          };
          schema.daily_table_runs.push(dailyTable);
          db.save();
        }

        // If table completed or failed, skip
        if (dailyTable.status === 'COMPLETED') continue;

        // 1. Initial Start Time Trigger (e.g. 11:00)
        if (dailyTable.attempt_count === 0 && currentTimeStr >= table.start_time) {
          console.log(`⏰ Scheduled initial run for table «${table.name}» at ${currentTimeStr}`);
          dailyTable.attempt_count = 1;
          dailyTable.last_attempt_at = now.toISOString();
          db.save();

          await executePriceTable(table.id, {
            triggerType: 'SCHEDULED',
            attemptNumber: 1
          });
          continue;
        }

        // 2. Retry Logic: Check if there are still pending sources for this table
        const activeSources = schema.table_sources.filter(
          (ts) => ts.price_table_id === table.id && ts.active
        );

        const pendingSources = activeSources.filter((source) => {
          const ds = schema.daily_source_runs.find(
            (d) => d.price_table_id === table.id && d.table_source_id === source.id && d.run_date === todayDateStr
          );
          if (!ds) return true;
          return ds.status === 'PENDING' || ds.status === 'NOT_UPDATED' || (ds.fresh && source.recheck_enabled);
        });

        if (pendingSources.length === 0) {
          dailyTable.status = 'COMPLETED';
          dailyTable.completed_at = now.toISOString();
          db.save();
          continue;
        }

        // Check if retry interval has passed
        if (dailyTable.last_attempt_at && dailyTable.attempt_count < table.max_attempts) {
          const lastAttemptTime = new Date(dailyTable.last_attempt_at).getTime();
          const intervalMs = (table.retry_interval_minutes || settings.default_retry_interval) * 60 * 1000;

          if (now.getTime() - lastAttemptTime >= intervalMs) {
            console.log(`🔁 Scheduled retry #${dailyTable.attempt_count + 1} for table «${table.name}»`);
            dailyTable.attempt_count += 1;
            dailyTable.last_attempt_at = now.toISOString();
            db.save();

            await executePriceTable(table.id, {
              triggerType: 'RECHECK',
              attemptNumber: dailyTable.attempt_count
            });
          }
        }
      }
    } catch (err) {
      console.error('Error during scheduler tick:', err);
    } finally {
      this.isTickRunning = false;
    }
  }
}

export const scheduler = new SchedulerWorker();
