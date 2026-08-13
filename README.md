# Site Bonitinho

### 1. Criar o arquivo `.env`

No diretório raiz do projeto, crie o arquivo `.env` e adicione uma `SECRET_KEY`:

```env
SECRET_KEY=chave_aleatoria
```

**Nunca** commite o arquivo `.env` no repositório. Certifique-se de que ele está no `.gitignore`.


### 2. Ao fazer o clone do seu projeto do github para o Python Anywhere, abra a pasta do seu repositorio e execute os comandos abaixo.


crie o .env
```bash
touch .env
python -c "import secrets; print(secrets.token_hex(32))" > .env
```


```bash
pip install --upgrade pip
pip install -r requirements.txt
```

