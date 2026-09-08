PUBLIC PAGE BUILD

liveihc-template.html  Editable HTML shell.
styles.css             Public page styles.
schedule.js            Pure schedule/admin JSON rules.
app.js                 Browser rendering and data.json polling.
data.json              Cron-generated public schedule snapshot.
build_health_centre.py Produces data.json, src/index.html and ../index.html.
index.html             Generated preview; do not edit by hand.

Run from doctor_scheduler (complete cron build):
    .venv/Scripts/python.exe src/build_health_centre.py

../index.html is the generated entry point. It loads styles.css, app.js and
schedule.js from src/ as separate public assets. app.js polls the static data.json
written by the cron build. Apache serves these files; no Python web process is
required. Keep Google credentials and the raw admin JSON outside the web root.
