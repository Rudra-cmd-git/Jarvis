const { app } = require('electron');

app.whenReady().then(() => {
  const runtime = {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  };

  try {
    const sqlite = require('node:sqlite');
    if (typeof sqlite.DatabaseSync !== 'function') {
      console.log(
        `SQLITE_PROBE ${JSON.stringify({ ...runtime, available: false, detail: 'DatabaseSync export missing' })}`,
      );
    } else {
      const db = new sqlite.DatabaseSync(':memory:');
      const row = db.prepare('SELECT 1 AS ok').get();
      db.close();
      console.log(
        `SQLITE_PROBE ${JSON.stringify({
          ...runtime,
          available: true,
          detail: `in-memory query returned ${row.ok}`,
        })}`,
      );
    }
  } catch (error) {
    console.log(
      `SQLITE_PROBE ${JSON.stringify({
        ...runtime,
        available: false,
        detail: error instanceof Error ? error.message : String(error),
      })}`,
    );
  }

  app.quit();
});
