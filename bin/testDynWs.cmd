call unixtime.bat TMS
rem set DATA={"features":[{"properties":{"type":"trr","code":"N1_999","nsv_id":"1","time":"%TMS%000"}}]}
rem echo %DATA%
cd curl
echo Posting data
rem call curl -i -H "Accept: application/json" -H "Content-Type: application/json" -X POST -d %DATA% http://localhost:8086/update
rem call curl -i -H "Accept: application/json" -H "Content-Type: application/json" -X POST -d "{ \"features\": [ {\"properties\": { \"type\":\"trr\", \"code\":\"N1_999\", \"nsv_id\":\"2\", \"time\": %TMS%000} } ] }" http://localhost:8086/update

rem call curl -i -H "Accept: application/json" -H "Content-Type: application/json" -X POST -d "{ \"features\": [ {\"properties\": { \"type\":\"trr\", \"code\":\"N1_999\", \"nsv_id\":\"1\", \"time\": %TMS%000} } ] }" http://localhost:8086/update
call curl -i -H "Accept: application/json" -H "Content-Type: application/json" -X POST -d "{ \"GAM_999\": { \"type\": \"ltc\", \"id\": \"999\", \"dateDebut\": \"29/04/2016 08:00\", \"dateFin\": \"30/04/2016 10:00\", \"heureDebut\": \"00:00:00\", \"heureFin\": \"00:00:00\", \"weekEnd\": \"2\", \"listeLigneArret\": \"SEM_C5\", \"texte\": \"C5 : Circulation difficile secteur Bachelard Du 29/02/2016 08:30 Jusqu à une date indéterminée La ligne est déviée, en direction de Palais de Justice, entre les arrêts Alliés et Cémoi. Les arrêts de Henri Dunant à Vallier Catane, direction Palais de Justice, ne sont pas desservis. Les arrêts Salengro et Champs Elysées de la ligne 12, ainsi que l'arrêt provisoire boulevard Joseph Vallier, sont desservis dans la déviation. Arrêt(s) non desservi(s): Docteur Schweitzer (Palais de Justice), Henri Dunant (Palais de Justice), Rhin et Danube (Palais de Justice), Vallier - Catane (Palai...\"} }" http://localhost:8086/updateEvt
cd ..