FROM node:20  
# Install OpenSSL and enable legacy provider
RUN apt-get update && apt-get install -y openssl && \
    echo "openssl_conf = default_conf" >> /etc/ssl/openssl.cnf && \
    echo "[default_conf]" >> /etc/ssl/openssl.cnf && \
    echo "ssl_conf = ssl_sect" >> /etc/ssl/openssl.cnf && \
    echo "[ssl_sect]" >> /etc/ssl/openssl.cnf && \
    echo "system_default = crypto_policy" >> /etc/ssl/openssl.cnf

# Set the working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the application code
COPY . .

# Expose the port your app runs on
EXPOSE 3001

# Start the application
CMD ["node", "index.js"]
