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

# https://github.com/dockerfile/java/blob/master/oracle-java7/Dockerfile
# Install Java: TODO
