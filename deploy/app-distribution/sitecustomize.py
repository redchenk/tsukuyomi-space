"""Process-local MSS cap for this host's Internet path; no global route changes."""
import socket

_OriginalSocket = socket.socket


class DistributionSocket(_OriginalSocket):
    def __init__(self, family=socket.AF_INET, type=socket.SOCK_STREAM, proto=0, fileno=None):
        super().__init__(family, type, proto, fileno)
        if fileno is None and family in (socket.AF_INET, socket.AF_INET6) and type == socket.SOCK_STREAM:
            self.setsockopt(socket.IPPROTO_TCP, socket.TCP_MAXSEG, 1200)


socket.socket = DistributionSocket
