# 🔧 PRODUCTION: frontend/Dockerfile
FROM node:22-alpine as builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# ✅ Accept build arguments
ARG VITE_BACKEND_URL
ARG VITE_WS_URL
ARG VITE_ORTHANC_URL

# ✅ Set environment variables from build args
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_ORTHANC_URL=$VITE_ORTHANC_URL

RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]