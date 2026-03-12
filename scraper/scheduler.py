import logging
import time

from apscheduler.schedulers.background import BackgroundScheduler

from scraper import run_scrape


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("scheduler")


def main() -> None:
    scheduler = BackgroundScheduler()

    def scrape_job() -> None:
        try:
            run_scrape()
        except Exception as exc:  # noqa: BLE001
            logger.exception("Scheduled scrape failed: %s", exc)

    def heartbeat_job() -> None:
        logger.info("Scheduler heartbeat – still running.")

    # Immediate scrape on startup (outside of the scheduler)
    logger.info("Running initial scrape on startup.")
    scrape_job()

    # Schedule recurring jobs
    scheduler.add_job(scrape_job, "interval", minutes=15, id="scrape_job")
    scheduler.add_job(heartbeat_job, "interval", hours=1, id="heartbeat_job")

    scheduler.start()
    logger.info("Scheduler started. Scraping every 15 minutes.")

    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        logger.info("Shutting down scheduler due to KeyboardInterrupt.")
    finally:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler shut down.")


if __name__ == "__main__":
    main()

