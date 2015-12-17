getBlobTextSample = function (blob) {
  var deferred = Q.defer();

  var self = this;
  var blob_text_sample = "";
  var blob_line_count = 0;
  var characters = 250;
  var maxLines = 5;

  var bylineStream = byLine(blob.createReadStream("blobs"));
  bylineStream.on('data', function (lineObject) {
    blob_line_count++;
    if (blob_line_count <= maxLines) {
      blob_text_sample += lineObject.toString().slice(0, characters) + "\n";
    }
  });
  bylineStream.on('end', function () {
    deferred.resolve({
      blob_line_count: blob_line_count,
      blob_text_sample: blob_text_sample,
    });
  });
  bylineStream.on("error", function () {
    deferred.reject(new Error("Error getting blob text samplef"));
  });

  return deferred.promise;
};
