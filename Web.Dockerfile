FROM oven/bun:debian
RUN apt-get update && apt-get upgrade -y && apt-get install -y curl wget bash build-essential
RUN mkdir -p /app
# Enable this if you don't need reload-ability
#COPY ./ /app
WORKDIR /app/web
CMD [ "bun", "run", "start" ]