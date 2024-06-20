FILE_PATH1="./src/localhost.crt"
FILE_PATH2="./src/localhost.key"

if [ ! -f "$FILE_PATH1" ] && [ ! -f "$FILE_PATH2" ]; then
    echo "Certification files do not exist. Running the script."
    openssl req -x509 -out localhost.crt -keyout localhost.key \
  -newkey rsa:2048 -nodes -sha256 \
  -subj '/CN=localhost' -extensions EXT -config <( \
   printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")
   mv localhost.crt ./src
   mv localhost.key ./src
else
    echo "Certification files exist"
fi
