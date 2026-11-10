/// Milliseconds since the Unix epoch, used for every timestamp the UI sorts by.
pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_after_the_epoch_and_monotonic_enough() {
        let first = now_ms();
        let second = now_ms();
        assert!(first > 1_700_000_000_000, "should be a 2020s-era timestamp");
        assert!(second >= first);
    }
}
