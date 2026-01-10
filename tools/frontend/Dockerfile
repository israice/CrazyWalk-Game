FROM nginx:alpine

# Copy nginx configuration
COPY tools/frontend/nginx.conf /etc/nginx/nginx.conf

# Copy static frontend files
COPY src/public /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
