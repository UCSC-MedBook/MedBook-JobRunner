# MedBook-JobRunner

## Jobs

### GSEA: preranked + leading edge (`RunGSEA`)

This job runs GSEAPreranked and then GSEA's leading edge analysis to generate a heat map.

#### Arguments

GSEA requires a gene set and a gene set group as arguments.

Optionally, the user can run the tool with a gene set created in another tool, such as the outlier analysis or Limma. These links/buttons would be found on the origin tool output page and not in the GSEA tool creation UI.

Optionally, the user can provide a phenotype (two sample groups). This will produce a heat map of samples vs. enriched gene sets.

- `gene_set_id`, `gene_set_name`: id and name of the gene set
- `gene_set_sort_field`: the field on which to sort the gene set. If this is not provided, the organic sort is used. (The order with which the gene set was loaded, stored in `gene_labels`.)
- `gene_set_group_ids`, `gene_set_group_names`: ids and names of the gene set groups. If multiple are provided, combine them into a single .gmt.
- `gene_set_associated_object`: provided if the job is running with a gene set created by another job. This is used to link to the gene set's origin.
- phenotype: optionally provided, produces a heat map of samples vs. pathways. NOTE: not currently implemented
  - `sample_group_a_id`: id for sample group A
  - `sample_group_b_id`: id for sample group B
  - `sample_group_a_name`: name for sample group A
  - `sample_group_b_name`: name for sample group B
- `set_max`, `set_min`, `plot_top_x`, `nperm`, `metric`, `scoring_scheme`: arguments provided to GseaPreranked

[See here for GSEA tool documentation](http://www.broadinstitute.org/cancer/software/gsea/doc/GSEAUserGuideFrame.html).

#### Output

GSEA's preranked tool creates a folder of HTML and data files which are linked together via relative hyperlinks. All of the files in this folder are saved as blobs. Leading Edge creates a heat map (png), which is also saved as a blob.

All of these files are stored as blobs with the `associated_object` being the job object. The GESA HTML folder entry-point is named `index.html`, and the heat map is named `leading_edge_heat_map_clustered.png`.

### Paired Tumor Analysis (`RunPairedAnalysis`)

This job computes a signature of differential gene expression between baseline and progression samples from the same patient.

#### Arguments

- `data_set_id`, `data_set_name`: the data set
- `primary_sample_labels`: sample labels of all the primary samples
- `progression_sample_labels`: sample labels of all the progression samples

#### Output

A gene set linked to the job via associated object security with the columns "Genes" and "Differential score". The differential score column is computed by taking the difference between the average values of the progression samples and that of the primary samples.

### Limma (`RunLimma`)

Limma (LInear Models for MicroArray data) runs the R bioconductor package `limma`. [See here for more details.](https://bioconductor.org/packages/release/bioc/html/limma.html)

#### Arguments
- `value_type`: value type of the data
- `experimental_sample_group_id`, `experimental_sample_group_name`, `experimental_sample_group_version`: experimental sample group
- `reference_sample_group_id`, `reference_sample_group_name`, `reference_sample_group_version`: reference sample group
- `top_genes_count`: number of genes to include in the signature

#### Output

The gene set created by limma is attached to the job via associated object security.

The two PDFs created by limma are stored as blobs, which are attached to the job. The blobs are named `Rplots.pdf` and `mds.pdf`.

### Outlier Analysis (`UpDownGenes`)

#### Arguments

TODO

#### Output

TODO

NOTE: no gene set will be created when there are 0 outliers.

## Steps to adding a new tools

1. create a feature branch in git
2. look at [an example job](https://github.com/UCSC-MedBook/MedBook-JobRunner/blob/master/webapp/server/classes/RunLimma.js)
3. create a new class
4. Add new class and its args to primary-collections repo collections/Jobs.js
4. add adapters (importers and exporters) to convert from MedBook objects to files that tools understand and store check them into external-tools
4. add external code to external-tools repo (or mechanism to install it)
5. add pointers to external code in your personal settings.json for use while testing
  - also add these pointers in the MedBook main repo docker-compose.yml METEOR_SETTINGS environment variable
6. add gui to appropriate MedBook app, that initiates job by inserting into jobs collection
  for example:
```js
Jobs.insert({
  name: "UpDownGenes",
  status: "waiting",
  user_id: user._id,
  collaborations: [ user.personalCollaboration() ],
  args: { ... }
});
```
7. read errors from jobs.error_description
