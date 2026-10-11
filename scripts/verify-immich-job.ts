async function testImmichJob() {
  console.log('--- 1. Submitting immich-app/immich to /api/github/analyze ---');
  const t0 = performance.now();
  const res = await fetch('http://localhost:3000/api/github/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner: 'immich-app',
      repo: 'immich',
      branch: 'main',
    }),
  });

  const data = await res.json();
  const enqueueDuration = (performance.now() - t0).toFixed(2);
  console.log(`Immediate Response received in ${enqueueDuration}ms:`, data);

  if (!data.jobId && !data.projectId) {
    console.error('Failed to get job ID:', data);
    process.exit(1);
  }

  if (data.cached) {
    console.log(`Already cached! Project ID: ${data.projectId}`);
    return;
  }

  const jobId = data.jobId;
  console.log(`Polling job ${jobId}...`);

  let lastStage = '';
  let lastMessage = '';

  while (true) {
    await new Promise((r) => setTimeout(r, 800));
    const pollRes = await fetch(`http://localhost:3000/api/jobs/${jobId}`);
    const pollData = await pollRes.json();
    const job = pollData.job;

    if (!job) {
      console.error('Job not found:', pollData);
      process.exit(1);
    }

    if (job.stage !== lastStage || job.progress.message !== lastMessage) {
      lastStage = job.stage;
      lastMessage = job.progress.message;
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      console.log(`[${elapsed}s] Stage: ${job.stage.toUpperCase()} | ${job.progress.message} (${job.progress.current}/${job.progress.total})`);
    }

    if (job.stage === 'completed') {
      const totalElapsed = ((performance.now() - t0) / 1000).toFixed(2);
      console.log(`\n🎉 Job completed in ${totalElapsed}s!`);
      console.log(`Project ID: ${job.projectId}`);
      console.log('Stats:', job.stats);
      break;
    }

    if (job.stage === 'failed') {
      console.error('❌ Job failed:', job.error);
      process.exit(1);
    }
  }

  // Verify caching: Re-submit the same repo immediately and measure time
  console.log('\n--- 2. Verifying Caching / Deduplication ---');
  const tCache = performance.now();
  const res2 = await fetch('http://localhost:3000/api/github/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner: 'immich-app',
      repo: 'immich',
      branch: 'main',
    }),
  });
  const data2 = await res2.json();
  const cacheDuration = (performance.now() - tCache).toFixed(2);
  console.log(`Cache response in ${cacheDuration}ms:`, data2);
  if (data2.cached || data2.status === 'completed') {
    console.log('✅ Cache verified! Reopening the same commit is instantaneous!');
  }
}

testImmichJob().catch(console.error);
