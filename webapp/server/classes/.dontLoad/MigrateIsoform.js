expression_isoform = new Meteor.Collection("expression_isoform");

function MigrateIsoform (job_id) {
  Job.call(this, job_id);
}
MigrateIsoform.prototype = Object.create(Job.prototype);
MigrateIsoform.prototype.constructor = MigrateIsoform;
MigrateIsoform.prototype.run = function () {
  expression_isoform.find({}).forEach(function (doc, index) {
    if (index % 100 === 0) {
      console.log("index:", index);
    }

    var splitTranscript = doc.transcript.split(".");
    var transcript_label = splitTranscript[0];
    var transcript_version = parseInt(splitTranscript[1], 10);

    var associatedGene = Genes.findOne({"transcripts.label": transcript_label});

    var bulk = IsoformExpression.rawCollection().initializeUnorderedBulkOp();

    for (var sample_label in doc.samples) {
      var query = {
        study_label: "prad_wcdt",
        collaborations: ["WCDT"],
        transcript_label: transcript_label,
        transcript_version: transcript_version,
        sample_label: sample_label,
      };

      if (associatedGene) {
        query.gene_label = associatedGene.gene_label;
      }

      var data = doc.samples[sample_label];
      if (data.rsem_quan2 === undefined || data.rsem_quan_log2 === undefined) {
        console.log("sample_label:", sample_label);
        console.log("data:", data);
        throw "quan and quan_log2 not both set";
      }

      bulk.find(query).upsert().updateOne({
        $set: {
          "values.quantile_counts": data.rsem_quan2,
          // NOTE: quantile_counts_log should be automatically generated
        }
      });
    }

    bulk.execute(function (error, result) {
      if (error) {
        console.log("error, result:", error, result);
      }
    });
  });
};

MigrateIsoform.prototype.onError = function (e) {
  console.log("e:", e);
};

Moko.ensureIndex(Genes, {
  "transcripts.label": 1,
});

Moko.ensureIndex(IsoformExpression, {
  study_label: 1,
  collaborations: 1,
  transcript_label: 1,
  transcript_version: 1,
  sample_label: 1,
});

Moko.ensureIndex(IsoformExpression, {
  study_label: 1,
  collaborations: 1,
  transcript_label: 1,
  transcript_version: 1,
  sample_label: 1,
  gene_label: 1,
});

JobClasses.MigrateIsoform = MigrateIsoform;
