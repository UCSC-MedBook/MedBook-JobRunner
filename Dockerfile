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
# Install Java.
# RUN \
#   echo oracle-java7-installer shared/accepted-oracle-license-v1-1 select true | debconf-set-selections && \
#   add-apt-repository -y ppa:webupd8team/java && \
#   apt-get update && \
#   apt-get install -y oracle-java7-installer && \
#   rm -rf /var/lib/apt/lists/* && \
#   rm -rf /var/cache/oracle-jdk7-installer
