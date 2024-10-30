# Use an official Node.js runtime as a parent image
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the package.json and package-lock.json files to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the application files to the container
COPY . .

# Specify the path to the Firebase credentials JSON in the environment
# This will be dynamically loaded from the mounted .env file and json key at runtime
ENV GOOGLE_APPLICATION_CREDENTIALS=/usr/src/app/insights-key.json

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]
