sudo systemctl stop basketbooster
sudo systemctl stop nginx

cd /var/www/basketbooster
git status
git pull
git log --oneline --graph --decorate --all

npm ci
export DATABASE_URL="file:/var/www/basketbooster/prisma/prod.sqlite"
rm -f prisma/prod.sqlite
npx prisma migrate deploy
ls -la prisma/prod.sqlite
sqlite3 prisma/prod.sqlite ".tables"
sqlite3 prisma/prod.sqlite "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
npm run build
sudo systemctl start basketbooster
sudo systemctl start nginx
sudo systemctl status basketbooster --no-pager
sudo systemctl status nginx --no-pager
