default:
  @just --choose

help:
  @just --list

build:
  docker build -f Dockerfile -t localhost/sarkart .

run:
  docker run --name sarkart -d -p 3000:3000 localhost/sarkart

stop:
  docker stop sarkart

clean:
  docker stop sarkart
  docker rm sarkart
  docker rmi localhost/sarkart
