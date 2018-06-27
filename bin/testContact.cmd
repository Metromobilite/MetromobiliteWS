call unixtime.bat TMS
cd curl
echo Posting data
call curl -i -H "Accept: application/json" -H "Content-Type: application/json" -X POST -d "{ \"name\": \"nb\", \"mail\": \"nicolas.brandli@sully-group.fr\", \"subject\": \"mail de test\", \"text\": \"Ceci est un mail de test.\" }" http://localhost:3000/api/contact/mail
rem call curl -i -H "Accept: application/json" -H "Content-Type: application/json" -X POST -d "{ \"name\": \"nb\", \"mail\": \"nicolas.brandli@sully-group.fr\", \"subject\": \"mail de test\", \"text\": \"Ceci est un mail de test.\" }" http://data.metromobilite.fr/api/contact/mail
cd ..