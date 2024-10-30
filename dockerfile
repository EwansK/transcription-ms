# Use Node.js as the base image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy the package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3001

# Set environment variables (or use a .env file as needed)
ENV NODE_ENV=production

# Start the application
CMD ["node", "index.js"]
