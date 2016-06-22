FROM medbook/meteor-base:v0.7
MAINTAINER Mike Risse

# Start Rscript install (pulled from https://github.com/rocker-org/rocker/blob/master/r-base/Dockerfile)

RUN apt-get update \
    && apt-get install -y --force-yes --no-install-recommends \
        r-base \
        r-recommended

# End Rscript install

# Install Limma R package requirements
RUN Rscript -e 'source("http://bioconductor.org/biocLite.R")' \
    -e 'biocLite("edgeR")'

# Install python requirements
RUN apt-get install -y --force-yes --no-install-recommends \
    python-pip \
    python-dev \
    build-essential
RUN easy_install pip
RUN pip install --upgrade virtualenv
RUN pip install pymongo

# Install Java
RUN apt-get -m update && apt-get install -y wget unzip openjdk-7-jre zip
