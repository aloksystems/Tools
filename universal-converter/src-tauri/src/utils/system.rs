use serde::Serialize;
use sysinfo::System;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResources {
    pub total_memory_mb: u64,
    pub available_memory_mb: u64,
    pub cpu_cores: usize,
    /// Ceiling on simultaneous jobs, derived from free memory and core count.
    pub recommended_concurrency: usize,
}

/// Snapshot of what the machine can absorb right now. The queue uses this so a
/// batch of 4K transcodes does not OOM a 4 GB laptop.
pub fn resources() -> SystemResources {
    let mut system = System::new_all();
    system.refresh_memory();

    let total_memory_mb = system.total_memory() / (1024 * 1024);
    let available_memory_mb = system.available_memory() / (1024 * 1024);
    let cpu_cores = System::physical_core_count().unwrap_or(1).max(1);

    // Budget roughly 1 GB of headroom per concurrent heavy job, never above cores.
    let by_memory = (available_memory_mb / 1024).max(1) as usize;
    let recommended_concurrency = by_memory.min(cpu_cores).clamp(1, 8);

    SystemResources {
        total_memory_mb,
        available_memory_mb,
        cpu_cores,
        recommended_concurrency,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_plausible_concurrency() {
        let snapshot = resources();
        assert!(snapshot.total_memory_mb > 0, "must see real memory");
        assert!(snapshot.cpu_cores >= 1);
        assert!((1..=8).contains(&snapshot.recommended_concurrency));
    }
}
